import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, withSession } from "@/db/client";
import { assets, comparableSales, dataSources, importRuns, leases, marketObservations, rentInvoices } from "@/db/schema";
import type { CpiSeries } from "../horus-engine";
import type { CurrentUser } from "../session";
import { DEMO_TODAY } from "../assumptions";
import { freshness, LAYERS, type Layer } from "./registry";

const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
/** "Now" for freshness: the real clock, since imports carry real dates. */
const now = () => new Date();

export async function listSources(user: CurrentUser) {
  return withSession(sess(user), async (tx) => {
    const src = await tx.select().from(dataSources);
    const runs = await tx.select().from(importRuns).orderBy(desc(importRuns.startedAt));
    const counts = await tx.select({ sourceId: marketObservations.sourceId, n: sql<number>`count(*)::int` }).from(marketObservations).groupBy(marketObservations.sourceId);
    const t = now();
    return LAYERS.map((layer) => ({
      layer,
      sources: src.filter((s) => s.layer === layer).map((s) => ({ ...s, observations: counts.find((c) => c.sourceId === s.id)?.n ?? 0, freshness: freshness(s.lastImportAt, s.cadenceDays, t), runs: runs.filter((r) => r.sourceId === s.id).slice(0, 5) })),
    }));
  });
}

export interface Series { indicator: string; label: string; unit: string; currency: string | null; points: { period: string; value: number }[]; latest: { period: string; value: number } | null; retrievedAt: string; licence: string; transform: string; sourceId: string }

/** Country-level series from the official layer (World Bank, and CAPMAS or CBE once a file is imported). */
export async function officialContext(user: CurrentUser): Promise<Series[]> {
  const rows = await withSession(sess(user), (tx) => tx.select().from(marketObservations).where(and(eq(marketObservations.location, "EGY"), inArray(marketObservations.sourceId, ["worldbank", "capmas_cpi", "cbe_fx"]))));
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(`${r.sourceId}|${r.indicator}`, [...(by.get(`${r.sourceId}|${r.indicator}`) ?? []), r]);
  return [...by.values()].map((rs) => {
    const pts = rs.map((r) => ({ period: r.period, value: Number(r.value) })).sort((a, b) => a.period.localeCompare(b.period));
    const r0 = rs.sort((a, b) => b.retrievedAt.getTime() - a.retrievedAt.getTime())[0];
    return { indicator: r0.indicator, label: r0.label, unit: r0.unit, currency: r0.currency, points: pts, latest: pts.at(-1) ?? null, retrievedAt: r0.retrievedAt.toISOString(), licence: r0.licence, transform: r0.transform, sourceId: r0.sourceId };
  });
}

/** Location and climate context for one asset: population around it, amenities, and its district's climate. */
export async function assetContext(user: CurrentUser, assetId: string) {
  return withSession(sess(user), async (tx) => {
    const [a] = await tx.select({ id: assets.id, districtId: assets.districtId }).from(assets).where(eq(assets.id, assetId));
    if (!a) return null;
    const obs = await tx.select().from(marketObservations).where(inArray(marketObservations.location, [a.id, a.districtId]));
    const osm = await tx.select().from(dataSources).where(eq(dataSources.id, "osm"));
    return { obs: obs.map((o) => ({ ...o, value: Number(o.value), retrievedAt: o.retrievedAt.toISOString() })), osm: osm[0] ?? null };
  });
}

/** Location context for every asset, for the market-intelligence table. */
export async function portfolioContext(user: CurrentUser) {
  return withSession(sess(user), async (tx) => {
    const as = await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr, districtId: assets.districtId }).from(assets).orderBy(assets.id);
    const obs = await tx.select().from(marketObservations).where(inArray(marketObservations.sourceId, ["worldpop", "osm", "nasa_power"]));
    const v = (loc: string, ind: string) => { const o = obs.find((x) => x.location === loc && x.indicator === ind); return o ? Number(o.value) : null; };
    return {
      rows: as.map((a) => ({ ...a, pop1: v(a.id, "pop_1km"), pop3: v(a.id, "pop_3km"), temp: v(a.districtId, "temp_avg"), rain: v(a.districtId, "rain_year"), solar: v(a.districtId, "solar"), amenities: obs.filter((o) => o.location === a.id && o.sourceId === "osm").reduce((s, o) => s + Number(o.value), 0) || null })),
      meta: Object.fromEntries(["worldpop", "nasa_power", "osm"].map((s) => { const o = obs.find((x) => x.sourceId === s); return [s, o ? { retrievedAt: o.retrievedAt.toISOString(), licence: o.licence, transform: o.transform, period: o.period } : null]; })) as Record<string, { retrievedAt: string; licence: string; transform: string; period: string } | null>,
    };
  });
}

/** The permissioned-property layer as it stands: sample comparables by evidence type, and the portfolio's own records. */
export async function propertyLayer(user: CurrentUser) {
  return withSession(sess(user), async (tx) => {
    const comps = await tx.select({ kind: comparableSales.evidenceKind, n: sql<number>`count(*)::int`, latest: sql<string>`max(${comparableSales.soldOn})::text` }).from(comparableSales).groupBy(comparableSales.evidenceKind);
    const lease = (await tx.select({ id: leases.id }).from(leases)).length;
    const invoices = (await tx.select({ id: rentInvoices.id }).from(rentInvoices)).length; // managers only, by row-level security
    return { comps, leases: lease, invoices };
  });
}

/** The CPI series HORUS uses for its inflation view: the World Bank's, if imported; otherwise null (the sample path). */
export async function importedCpi(reader?: { select: Awaited<ReturnType<typeof getDb>>["select"] }): Promise<CpiSeries | null> {
  // Pass the caller's transaction when there is one: a second connection inside a transaction would wait forever.
  const db = reader ?? (await getDb());
  const rows = await db.select().from(marketObservations).where(and(eq(marketObservations.sourceId, "worldbank"), eq(marketObservations.indicator, "FP.CPI.TOTL")));
  if (rows.length < 3) return null;
  const at = rows.map((r) => r.retrievedAt).sort((a, b) => b.getTime() - a.getTime())[0];
  return { source: `World Bank, consumer price index (2010 = 100), annual averages to ${rows.map((r) => r.period).sort().at(-1)}`, published: at.toISOString().slice(0, 10), points: Object.fromEntries(rows.map((r) => [`${r.period}-07`, Number(r.value)])) };
}

export const LAYER_ORDER: Layer[] = LAYERS;
export { DEMO_TODAY };
