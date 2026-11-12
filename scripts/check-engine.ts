import { getDb } from "../src/db/client";
import { assets, comparableSales, marketSeries } from "../src/db/schema";
import { makeMarket, runValuation, type PropertyType, type Finish } from "../src/lib/valuation";
(async () => {
  const db = await getDb();
  const A = await db.select().from(assets);
  const sales = await db.select().from(comparableSales);
  const market = makeMarket(await db.select().from(marketSeries));
  const out: string[] = [];
  const levels: Record<string, number> = {};
  let maxDrift = 0;
  for (const a of A) {
    const r = runValuation({ districtId: a.districtId, type: a.type as PropertyType, areaSqm: a.areaSqm, floor: a.floor, finish: a.finish as Finish, buildingAge: a.yearBuilt ? 2026 - a.yearBuilt : null }, sales, market);
    levels[r.confidence.level] = (levels[r.confidence.level] ?? 0) + 1;
    maxDrift = Math.max(maxDrift, Math.abs(r.driftVsCompsPct ?? 0));
    out.push(`${a.id} ${a.type.padEnd(9)} est=${r.estimateEgp} seedVal=${a.valueEgp} ${r.estimateEgp === a.valueEgp ? "=" : "!"} range=${r.spreadPct}% conf=${r.confidence.level} disp=${r.confidence.dispersion} drift=${r.driftVsCompsPct}% comps=${r.comps.length}`);
  }
  console.log(out.slice(0, 12).join("\n")); console.log(levels, "maxDrift", maxDrift);
})();
