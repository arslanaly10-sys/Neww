import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "18.1.1.1" }) }));
import { and, eq } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import { dataSources, importRuns, marketObservations } from "../src/db/schema";
import { freshness, SOURCES } from "../src/lib/market-data/registry";
import { assetContext, importedCpi, listSources, officialContext, portfolioContext, propertyLayer } from "../src/lib/market-data/service";
import { importFile, importNow, recordImport } from "../src/lib/market-data/importers";
import { getRun, startAssetRun } from "../src/lib/horus-runs";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), an = U("u-analyst", "analyst"), adm = U("u-admin", "admin");

describe("the registry", () => {
  it("lists every source in one of the layers, each with a licence and how it is reached", async () => {
    const layers = await listSources(mgr);
    expect(layers.map((l) => l.layer)).toEqual(["official", "location", "climate", "earth", "property"]);
    const all = layers.flatMap((l) => l.sources);
    expect(all.length).toBe(SOURCES.length);
    expect(all.every((s) => s.licence && s.access)).toBe(true);
    expect(all.find((s) => s.id === "egypt_mls")!.access).toBe("partnership");
    expect(all.find((s) => s.id === "capmas_cpi")!.access).toBe("file");
  });
  it("freshness follows the expected cadence", () => {
    const now = new Date("2026-11-14T00:00:00Z");
    expect(freshness(null, 30, now)).toBe("never");
    expect(freshness(new Date("2026-11-01T00:00:00Z"), 30, now)).toBe("fresh");
    expect(freshness(new Date("2026-09-30T00:00:00Z"), 30, now)).toBe("due");
    expect(freshness(new Date("2026-06-01T00:00:00Z"), 30, now)).toBe("stale");
    expect(freshness(null, null, now)).toBe("na");
  });
});

describe("the imported snapshot", () => {
  it("every observation carries its source, place, period, unit, retrieval time, licence and processing", async () => {
    const rows = await (await getDb()).select().from(marketObservations);
    expect(rows.length).toBeGreaterThan(50);
    for (const r of rows) {
      expect(r.sourceId && r.location && r.period && r.unit && r.licence && r.transform).toBeTruthy();
      expect(r.retrievedAt).toBeInstanceOf(Date);
    }
    const sources = new Set(rows.map((r) => r.sourceId));
    expect(sources.has("worldpop") && sources.has("nasa_power") && sources.has("worldbank")).toBe(true);
  });
  it("official context: World Bank series for Egypt, sorted, with a latest value", async () => {
    const s = await officialContext(inv);
    const pop = s.find((x) => x.indicator === "SP.POP.TOTL")!;
    expect(pop.latest!.value).toBeGreaterThan(80_000_000);
    expect(pop.points.map((p) => p.period)).toEqual([...pop.points.map((p) => p.period)].sort());
    expect(pop.licence).toBe("CC BY 4.0");
  });
  it("location context per asset: people within 1 and 3 km, district climate; nothing invented where a source failed", async () => {
    const ctx = (await assetContext(mgr, "A-001"))!;
    const p1 = ctx.obs.find((o) => o.indicator === "pop_1km")!, p3 = ctx.obs.find((o) => o.indicator === "pop_3km")!;
    expect(p3.value).toBeGreaterThan(p1.value);
    expect(ctx.obs.find((o) => o.indicator === "temp_avg")!.value).toBeGreaterThan(15);
    const osm = (await (await getDb()).select().from(marketObservations).where(eq(marketObservations.sourceId, "osm"))).length;
    const [osmSrc] = await (await getDb()).select().from(dataSources).where(eq(dataSources.id, "osm"));
    if (osm === 0) expect(osmSrc.lastStatus).toBe("failed");
    const pc = await portfolioContext(mgr);
    expect(pc.rows.length).toBe(30);
    expect(pc.rows.every((r) => r.pop1 !== null)).toBe(true);
  });
  it("the property layer: comparables by evidence type, and rent records only for managers", async () => {
    const m = await propertyLayer(mgr), i = await propertyLayer(inv);
    expect(m.comps.reduce((s, c) => s + c.n, 0)).toBe(400);
    expect(m.invoices).toBeGreaterThan(0);
    expect(i.invoices).toBe(0);
  });
});

describe("imports", () => {
  it("only the administrator imports; a published file is checked line by line", async () => {
    expect(await importNow(mgr, "worldbank")).toEqual({ ok: false, error: "forbidden" });
    expect(await importFile(an, { sourceId: "capmas_cpi", published: "2026-10-10", text: "2026-09,284.3" })).toEqual({ ok: false, error: "forbidden" });
    expect(await importFile(adm, { sourceId: "capmas_cpi", published: "2026-10-10", text: "2026-09,abc" })).toMatchObject({ ok: false, error: "invalid", line: "2026-09,abc" });
    const r = await importFile(adm, { sourceId: "capmas_cpi", published: "2026-10-10", text: "period,value\n2026-08,281.4\n2026-09,284.3" });
    expect(r).toEqual({ ok: true, rows: 2 });
    const rows = await (await getDb()).select().from(marketObservations).where(eq(marketObservations.sourceId, "capmas_cpi"));
    expect(rows.map((x) => x.period).sort()).toEqual(["2026-08", "2026-09"]);
    expect(rows[0].transform).toContain("published on 2026-10-10 by u-admin");
    // Importing the same period again updates it rather than duplicating it.
    await importFile(adm, { sourceId: "capmas_cpi", published: "2026-10-12", text: "2026-09,284.9" });
    const again = await (await getDb()).select().from(marketObservations).where(and(eq(marketObservations.sourceId, "capmas_cpi"), eq(marketObservations.period, "2026-09")));
    expect(again.length).toBe(1);
    expect(Number(again[0].value)).toBe(284.9);
  });
  it("a failed import is logged and keeps the previous copy", async () => {
    const before = (await (await getDb()).select().from(marketObservations).where(eq(marketObservations.sourceId, "worldpop"))).length;
    expect(await recordImport("worldpop", new Error("timeout"), "test")).toEqual({ ok: false, error: "timeout" });
    const after = (await (await getDb()).select().from(marketObservations).where(eq(marketObservations.sourceId, "worldpop"))).length;
    expect(after).toBe(before);
    const [src] = await (await getDb()).select().from(dataSources).where(eq(dataSources.id, "worldpop"));
    expect(src).toMatchObject({ lastStatus: "failed", lastError: "timeout" });
    const runs = await (await getDb()).select().from(importRuns).where(eq(importRuns.sourceId, "worldpop"));
    expect(runs.some((r) => r.status === "failed")).toBe(true);
  });
  it("market data cannot be written through the app connection", async () => {
    await expect(withSession({ userId: adm.id, role: "admin" }, (tx) => tx.update(marketObservations).set({ value: "1" }))).rejects.toThrow();
  });
});

describe("HORUS uses the imported inflation series", () => {
  it("the inflation view names the World Bank CPI when it has been imported", async () => {
    const cpi = await importedCpi();
    expect(cpi!.source).toMatch(/World Bank, consumer price index/);
    const r = await startAssetRun(mgr, "A-007");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await getRun(mgr, r.id))!.result.views.real.source).toMatch(/World Bank/);
  });
});
