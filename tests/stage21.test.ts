import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "21.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { withSession } from "../src/db/client";
import { climateAssessments } from "../src/db/schema";
import { DISTRICT_SITE, overall, screen } from "../src/lib/climate-rules";
import { assetClimate, climatePortfolio, recordAssessment } from "../src/lib/climate";
import { listNotifications } from "../src/lib/notify";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const m1 = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), an = U("u-analyst", "analyst"), adm = U("u-admin", "admin");
const cairo = { tempMax: 45.4, tempAvg: 21.8, rainWettest: 16.8, wind: 2.9, elevation: 135, solar: 5.8 };
const flat = { type: "apartment", floor: 4, yearBuilt: 2015, status: "ready" };
const lv = (r: ReturnType<typeof screen>, h: string) => r.find((x) => x.hazard === h)!;

describe("screening rules", () => {
  it("is deterministic and explains every level", () => {
    const a = screen(flat, DISTRICT_SITE.zamalek, cairo), b = screen(flat, DISTRICT_SITE.zamalek, cairo);
    expect(a).toEqual(b);
    for (const r of a) { expect(r.drivers.length).toBeGreaterThan(0); expect(r.screening).toBeGreaterThanOrEqual(1); expect(r.screening).toBeLessThanOrEqual(5); }
  });

  it("heat: hot record plus urban heat; bare land is lower", () => {
    expect(lv(screen(flat, DISTRICT_SITE.zamalek, cairo), "heat").screening).toBe(4);
    expect(lv(screen(flat, DISTRICT_SITE["new-capital"], { ...cairo, tempMax: 44.2 }), "heat").screening).toBe(2);
    expect(lv(screen({ ...flat, type: "land", floor: null }, DISTRICT_SITE.zamalek, cairo), "heat").screening).toBe(2);
  });

  it("flood: desert towns on wadi paths and ground-level units score higher", () => {
    expect(lv(screen(flat, DISTRICT_SITE["new-cairo"], cairo), "flood").screening).toBe(3);
    expect(lv(screen({ ...flat, type: "villa", floor: null }, DISTRICT_SITE["new-cairo"], cairo), "flood").screening).toBe(4);
    expect(lv(screen(flat, DISTRICT_SITE.zamalek, cairo), "flood").screening).toBe(2);
  });

  it("coastal only near the sea; seismic higher for older structures", () => {
    expect(lv(screen(flat, DISTRICT_SITE["north-coast"], { ...cairo, elevation: 21 }), "coastal").screening).toBe(4);
    expect(lv(screen(flat, DISTRICT_SITE.zamalek, cairo), "coastal").screening).toBe(1);
    expect(lv(screen({ ...flat, yearBuilt: 1975 }, DISTRICT_SITE.zamalek, cairo), "seismic").screening).toBe(3);
    expect(lv(screen(flat, DISTRICT_SITE.zamalek, cairo), "seismic").screening).toBe(2);
  });

  it("a site assessment replaces the screen; finished works lower the residual, works under way do not", () => {
    const ov = [{ id: "X", hazard: "heat", level: 2, method: "site_survey", note: "", assessedOn: "2026-01-01" }];
    const r = lv(screen(flat, DISTRICT_SITE.zamalek, cairo, [], ov), "heat");
    expect(r).toMatchObject({ screening: 4, level: 2, residual: 2, confidence: "medium" });
    const done = lv(screen(flat, DISTRICT_SITE.zamalek, cairo, [{ id: "CX", category: "solar", status: "done", title: "Solar" }]), "heat");
    expect(done).toMatchObject({ level: 4, residual: 3 });
    expect(lv(screen(flat, DISTRICT_SITE.zamalek, cairo, [{ id: "CX", category: "solar", status: "in_progress", title: "Solar" }]), "heat").residual).toBe(4);
    expect(overall(screen(flat, DISTRICT_SITE.zamalek, cairo))).toEqual({ level: 4, hazards: ["heat"] });
  });
});

describe("portfolio exposure", () => {
  it("covers every asset; value shares add up to one per hazard; seeded assessments apply", async () => {
    const p = (await climatePortfolio(inv))!;
    expect(p.rows.length).toBe(30);
    for (const h of p.byHazard) expect(h.high + h.medium + h.low).toBeCloseTo(1, 6);
    expect(p.overrides).toBe(2);
    const coast = p.rows.find((r) => r.results.find((x) => x.hazard === "coastal")!.override)!;
    expect(coast.results.find((x) => x.hazard === "coastal")).toMatchObject({ level: 3 });
    expect(p.byHazard.find((h) => h.hazard === "coastal")!.assets).toBeGreaterThan(0);
    expect(await climatePortfolio(adm)).toBeNull();
  });

  it("investors see the same levels as managers (adaptation works count for everyone)", async () => {
    const a = (await climatePortfolio(inv))!, b = (await climatePortfolio(m1))!;
    expect(a.rows.map((r) => r.results.map((x) => x.residual))).toEqual(b.rows.map((r) => r.results.map((x) => x.residual)));
  });
});

describe("site assessments", () => {
  it("investors and admins cannot record; findings and dates are checked", async () => {
    const ok = { assetId: "A-020", hazard: "heat", level: 3, method: "site_survey", note: "Shaded courtyard, insulated roof slab.", assessedOn: "2026-11-01" };
    expect(await recordAssessment(inv, ok)).toEqual({ ok: false, error: "forbidden" });
    expect(await recordAssessment(adm, ok)).toEqual({ ok: false, error: "forbidden" });
    expect(await recordAssessment(an, { ...ok, note: "short" })).toEqual({ ok: false, error: "invalid" });
    expect(await recordAssessment(an, { ...ok, assessedOn: "2027-01-01" })).toEqual({ ok: false, error: "invalid" });
    expect(await recordAssessment(an, { ...ok, level: 6 })).toEqual({ ok: false, error: "invalid" });
    expect(await recordAssessment(an, { ...ok, assetId: "A-999" })).toEqual({ ok: false, error: "not_found" });
  });

  it("an analyst's assessment replaces the screen, keeps history, and a high result alerts managers", async () => {
    const r1 = await recordAssessment(an, { assetId: "A-020", hazard: "flood", level: 5, method: "insurer_survey", note: "Basement car park took water in the 2024 storm.", assessedOn: "2026-10-01" });
    expect(r1).toMatchObject({ ok: true });
    if (!r1.ok) return;
    expect(r1.result).toMatchObject({ level: 5, residual: 5 });
    expect((await listNotifications(m1, "en")).find((x) => x.kind === "climate_high")!.title).toBe("A-020: flooding from heavy rain exposure is now high");
    const r2 = await recordAssessment(m1, { assetId: "A-020", hazard: "flood", level: 3, method: "engineer_report", note: "Sump pumps and flood barriers fitted at the ramp.", assessedOn: "2026-11-05" });
    expect(r2).toMatchObject({ ok: true });
    const c = (await assetClimate(inv, "A-020"))!;
    expect(c.results.find((x) => x.hazard === "flood")).toMatchObject({ level: 3 });
    expect(c.history.length).toBe(2);
    expect(c.history.filter((h) => !h.supersededAt).length).toBe(1);
  });

  it("row-level security: nothing is deleted and investors cannot write", async () => {
    await expect(withSession({ userId: m1.id, role: "manager" }, (tx) => tx.delete(climateAssessments).where(eq(climateAssessments.id, "CA-001")))).rejects.toThrow();
    await expect(withSession({ userId: inv.id, role: "investor" }, (tx) => tx.insert(climateAssessments).values({ id: "CA-900", assetId: "A-001", hazard: "heat", level: 1, method: "desk_review", note: "xxxxxxxxxx", assessedOn: "2026-01-01", recordedBy: inv.id, recordedAt: new Date() }))).rejects.toThrow();
  });
});
