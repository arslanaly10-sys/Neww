import "server-only";
import { sql } from "drizzle-orm";
import { assets, districts, leases, tenants, documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withSession } from "@/db/client";
import type { CurrentUser } from "./session";
import { can } from "./permissions";

/**
 * Data access for pages. Every query runs inside withSession(), so Postgres RLS applies.
 * RLS is row-level, so the one column-level rule (rent hidden from investors) is applied here.
 */
export async function getPortfolio(user: CurrentUser) {
  return withSession({ userId: user.id, role: user.role }, async (tx) => {
    const rows = await tx.select({ a: assets, d: districts }).from(assets).innerJoin(districts, eq(assets.districtId, districts.id));
    const ls = await tx.select({ l: leases, t: tenants }).from(leases).innerJoin(tenants, eq(leases.tenantId, tenants.id));
    const showIncome = can(user.role, "asset.income_costs.view");
    const leaseByAsset = new Map(ls.map((x) => [x.l.assetId, { ...x.l, monthlyRent: showIncome ? x.l.monthlyRent : null, tenant: x.t }]));
    return rows.map(({ a, d }) => ({ ...a, district: d, lease: leaseByAsset.get(a.id) ?? null }));
  });
}
export type PortfolioRow = Awaited<ReturnType<typeof getPortfolio>>[number];

export async function getDocuments(user: CurrentUser) {
  return withSession({ userId: user.id, role: user.role }, (tx) => tx.select().from(documents));
}
