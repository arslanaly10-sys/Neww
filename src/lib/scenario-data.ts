import { gte, sql } from "drizzle-orm";
import { assets, cashflows, documents, leases } from "@/db/schema";
import type { DB } from "@/db/client";
import { DEMO_TODAY } from "./assumptions";
import type { BaseAsset } from "./scenario";

/** Assemble the base data the scenario engine runs on. Reads income and costs, so it runs on the privileged connection only. */
export async function loadScenarioBase(db: DB, today = DEMO_TODAY): Promise<BaseAsset[]> {
  const end = new Date(`${today}T00:00:00Z`);
  const from = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, 1)).toISOString().slice(0, 10);
  const [a, l, d, c] = await Promise.all([
    db.select().from(assets),
    db.select().from(leases),
    db.select().from(documents),
    db.select({ assetId: cashflows.assetId, pos: sql<number>`sum(case when ${cashflows.amountEgp} > 0 then ${cashflows.amountEgp} else 0 end)::float8`, neg: sql<number>`sum(case when ${cashflows.amountEgp} < 0 then -${cashflows.amountEgp} else 0 end)::float8` }).from(cashflows).where(gte(cashflows.month, from)).groupBy(cashflows.assetId),
  ]);
  return a.sort((x, y) => x.id.localeCompare(y.id)).map((x) => {
    const lease = l.find((y) => y.assetId === x.id);
    const cf = c.find((y) => y.assetId === x.id);
    const usd = lease?.currency === "USD";
    return {
      id: x.id, name: x.name, nameAr: x.nameAr, districtId: x.districtId, type: x.type, occupancy: x.occupancy, vacantSince: x.vacantSince,
      valueEgp: x.valueEgp, costEgp: x.costEgp, leaseCurrency: lease?.currency ?? null, leaseEnd: lease?.endDate ?? null,
      docs: d.filter((y) => y.assetId === x.id).map((y) => ({ kind: y.kind, status: y.status })),
      rentEgp: usd ? 0 : Math.round(cf?.pos ?? 0), rentUsdAtBase: usd ? Math.round(cf?.pos ?? 0) : 0, costsEgp: Math.round(cf?.neg ?? 0),
    };
  });
}
